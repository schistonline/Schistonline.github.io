// ============================================
// ADMIN VIDEOS MANAGEMENT
// Complete admin dashboard for video moderation
// ============================================

console.log('🎬 Admin Videos loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AdminVideos = {
    currentUser: null,
    videos: [],
    filteredVideos: [],
    suppliers: [],
    currentPage: 1,
    itemsPerPage: 15,
    totalPages: 1,
    totalVideos: 0,
    isLoading: false,
    selectedVideos: new Set(),
    filters: {
        search: '',
        supplier: 'all',
        status: 'all',
        date: 'all',
        sort: 'latest'
    },
    charts: {
        uploads: null,
        performance: null
    },
    currentVideoId: null,
    
    async init() {
        console.log('📊 Admin Videos initializing...');
        
        try {
            await this.checkAuth();
            await this.loadAdminProfile();
            await this.loadSuppliers();
            await this.loadVideos();
            this.initCharts();
            this.setupEventListeners();
            
            console.log('✅ Admin Videos initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading videos', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'admin-login.html?redirect=admin-videos.html';
                return;
            }
            
            // Check if user is admin
            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin, admin_role, full_name')
                .eq('id', user.id)
                .single();
            
            if (profileError || !profile?.is_admin) {
                window.location.href = 'index.html';
                return;
            }
            
            this.currentUser = { ...user, ...profile };
            console.log('✅ Admin authenticated:', this.currentUser.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'admin-login.html';
        }
    },
    
    async loadAdminProfile() {
        const adminName = document.getElementById('adminName');
        const adminRole = document.getElementById('adminRole');
        const adminAvatar = document.getElementById('adminAvatar');
        
        if (adminName) adminName.textContent = this.currentUser.full_name || 'Admin User';
        if (adminRole) adminRole.textContent = this.currentUser.admin_role || 'Super Admin';
        if (adminAvatar) {
            const initials = (this.currentUser.full_name || 'Admin')
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            adminAvatar.textContent = initials;
        }
    },
    
    async loadSuppliers() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id, business_name')
                .order('business_name');
            
            if (error) throw error;
            
            this.suppliers = data || [];
            
            const supplierFilter = document.getElementById('supplierFilter');
            if (supplierFilter) {
                supplierFilter.innerHTML = '<option value="all">All Suppliers</option>' +
                    this.suppliers.map(s => `<option value="${s.id}">${this.escapeHtml(s.business_name)}</option>`).join('');
            }
            
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    },
    
    async loadVideos(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            // Get total count first
            let countQuery = sb
                .from('product_videos')
                .select('*', { count: 'exact', head: true });
            
            // Apply filters to count
            countQuery = this.applyFiltersToQuery(countQuery);
            
            const { count, error: countError } = await countQuery;
            
            if (countError) throw countError;
            
            this.totalVideos = count || 0;
            this.totalPages = Math.ceil(this.totalVideos / this.itemsPerPage);
            
            // Get paginated data
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('product_videos')
                .select(`
                    *,
                    supplier:suppliers!product_videos_supplier_id_fkey (
                        id,
                        business_name,
                        profile:profiles!suppliers_profile_id_fkey (
                            avatar_url,
                            full_name
                        )
                    ),
                    product:ads!product_videos_product_id_fkey (
                        id,
                        title,
                        price,
                        image_urls
                    )
                `);
            
            // Apply filters
            query = this.applyFiltersToQuery(query);
            
            // Apply sorting
            if (this.filters.sort === 'latest') {
                query = query.order('created_at', { ascending: false });
            } else if (this.filters.sort === 'oldest') {
                query = query.order('created_at', { ascending: true });
            } else if (this.filters.sort === 'most_viewed') {
                query = query.order('views', { ascending: false });
            } else if (this.filters.sort === 'most_liked') {
                query = query.order('likes', { ascending: false });
            } else if (this.filters.sort === 'most_commented') {
                query = query.order('comments', { ascending: false });
            }
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.videos = data || [];
            } else {
                this.videos = [...this.videos, ...(data || [])];
            }
            
            this.filteredVideos = this.videos;
            this.updateStats();
            this.renderTable();
            this.updatePagination();
            
        } catch (error) {
            console.error('Error loading videos:', error);
            this.showToast('Error loading videos', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    applyFiltersToQuery(query) {
        // Apply search
        if (this.filters.search) {
            query = query.or(`caption.ilike.%${this.filters.search}%`);
        }
        
        // Apply supplier filter
        if (this.filters.supplier && this.filters.supplier !== 'all') {
            query = query.eq('supplier_id', this.filters.supplier);
        }
        
        // Apply status filter
        if (this.filters.status && this.filters.status !== 'all') {
            if (this.filters.status === 'active') {
                query = query.eq('is_active', true);
            } else if (this.filters.status === 'inactive') {
                query = query.eq('is_active', false);
            } else if (this.filters.status === 'reported') {
                // This would need a reported flag in your videos table
                // query = query.eq('is_reported', true);
            }
        }
        
        // Apply date filter
        if (this.filters.date && this.filters.date !== 'all') {
            const now = new Date();
            let startDate = new Date();
            
            if (this.filters.date === 'today') {
                startDate.setHours(0, 0, 0, 0);
            } else if (this.filters.date === 'week') {
                startDate.setDate(now.getDate() - 7);
            } else if (this.filters.date === 'month') {
                startDate.setMonth(now.getMonth() - 1);
            } else if (this.filters.date === 'year') {
                startDate.setFullYear(now.getFullYear() - 1);
            }
            
            query = query.gte('created_at', startDate.toISOString());
        }
        
        return query;
    },
    
    updateStats() {
        const totalVideos = this.videos.length;
        const totalViews = this.videos.reduce((sum, v) => sum + (v.views || 0), 0);
        const totalLikes = this.videos.reduce((sum, v) => sum + (v.likes || 0), 0);
        const totalComments = this.videos.reduce((sum, v) => sum + (v.comments || 0), 0);
        const reportedVideos = this.videos.filter(v => v.is_reported).length;
        const activeSuppliers = new Set(this.videos.map(v => v.supplier_id)).size;
        
        document.getElementById('totalVideos').textContent = this.formatNumber(totalVideos);
        document.getElementById('totalViews').textContent = this.formatNumber(totalViews);
        document.getElementById('totalLikes').textContent = this.formatNumber(totalLikes);
        document.getElementById('totalComments').textContent = this.formatNumber(totalComments);
        document.getElementById('reportedVideos').textContent = this.formatNumber(reportedVideos);
        document.getElementById('activeSuppliers').textContent = this.formatNumber(activeSuppliers);
        
        // Update trends (mock data - replace with real calculations)
        document.getElementById('videosTrend').textContent = '+12% from last month';
        document.getElementById('viewsTrend').textContent = '+23% from last month';
        document.getElementById('likesTrend').textContent = '+18% from last month';
        document.getElementById('commentsTrend').textContent = '+8% from last month';
        document.getElementById('reportedTrend').textContent = reportedVideos + ' pending review';
        document.getElementById('suppliersTrend').textContent = 'with videos';
    },
    
    renderTable() {
        const tbody = document.getElementById('videosTableBody');
        if (!tbody) return;
        
        if (this.videos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 60px;">
                        <i class="fas fa-video-slash" style="font-size: 40px; color: var(--gray-300); margin-bottom: 16px;"></i>
                        <p style="color: var(--gray-500);">No videos found</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.videos.map(video => this.renderTableRow(video)).join('');
        
        // Update select all checkbox state
        const selectAll = document.getElementById('selectAll');
        if (selectAll) {
            selectAll.checked = this.videos.length > 0 && 
                this.videos.every(v => this.selectedVideos.has(v.id));
            selectAll.indeterminate = this.selectedVideos.size > 0 && 
                this.selectedVideos.size < this.videos.length;
        }
    },
    
    renderTableRow(video) {
        const supplier = video.supplier || {};
        const product = video.product || {};
        const supplierName = supplier.business_name || 'Unknown Supplier';
        const supplierInitial = supplierName.charAt(0).toUpperCase();
        const productTitle = product.title || 'Unknown Product';
        const thumbnail = video.thumbnail_url || video.video_url || 'https://via.placeholder.com/60x80';
        const duration = this.formatDuration(video.duration || 0);
        const createdAt = new Date(video.created_at).toLocaleDateString();
        const status = video.is_active ? 'active' : 'inactive';
        const isSelected = this.selectedVideos.has(video.id);
        
        return `
            <tr>
                <td class="checkbox-col">
                    <input type="checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="AdminVideos.toggleSelect(${video.id})">
                </td>
                <td>
                    <div class="video-cell">
                        <div class="video-thumb" onclick="AdminVideos.viewVideo(${video.id})">
                            <img src="${thumbnail}" alt="${this.escapeHtml(productTitle)}">
                            <div class="play-overlay">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="video-info">
                            <h4>${this.escapeHtml(productTitle)}</h4>
                            <p class="video-caption">${this.escapeHtml(video.caption || '').substring(0, 40)}${video.caption?.length > 40 ? '...' : ''}</p>
                            <span class="video-duration">${duration}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="supplier-cell">
                        <div class="supplier-avatar">${supplierInitial}</div>
                        <div class="supplier-info">
                            <h4>${this.escapeHtml(supplierName)}</h4>
                            <p>ID: ${supplier.id || 'N/A'}</p>
                        </div>
                    </div>
                </td>
                <td>${this.escapeHtml(productTitle)}</td>
                <td>
                    <div class="stats-cell">
                        <div class="stat-item">
                            <div class="stat-value">${video.views || 0}</div>
                            <div class="stat-label">Views</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${video.likes || 0}</div>
                            <div class="stat-label">Likes</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${video.comments || 0}</div>
                            <div class="stat-label">Comments</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${status}">${status}</span>
                    ${video.featured ? '<span class="status-badge featured" style="margin-left: 4px;">Featured</span>' : ''}
                </td>
                <td>${createdAt}</td>
                <td>
                    <div class="action-buttons">
                        <button class="table-action-btn view" onclick="AdminVideos.viewVideo(${video.id})" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="table-action-btn edit" onclick="AdminVideos.openEditModal(${video.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="table-action-btn warn" onclick="AdminVideos.openWarnModal(${video.id})" title="Warn Supplier">
                            <i class="fas fa-exclamation-triangle"></i>
                        </button>
                        <button class="table-action-btn delete" onclick="AdminVideos.openDeleteModal(${video.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },
    
    initCharts() {
        this.initUploadsChart();
        this.initPerformanceChart();
    },
    
    initUploadsChart() {
        const ctx = document.getElementById('uploadsChart')?.getContext('2d');
        if (!ctx) return;
        
        // Generate last 30 days labels
        const labels = [];
        const data = [];
        const now = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            data.push(Math.floor(Math.random() * 10) + 1); // Replace with real data
        }
        
        this.charts.uploads = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Video Uploads',
                    data: data,
                    borderColor: '#0B4F6C',
                    backgroundColor: 'rgba(11, 79, 108, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2,
                    pointBackgroundColor: '#0B4F6C',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: true, color: '#F3F4F6' },
                        ticks: { stepSize: 5 }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    },
    
    initPerformanceChart() {
        const ctx = document.getElementById('performanceChart')?.getContext('2d');
        if (!ctx) return;
        
        const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        
        this.charts.performance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Views',
                        data: [65, 59, 80, 81],
                        backgroundColor: 'rgba(11, 79, 108, 0.8)',
                        borderRadius: 6
                    },
                    {
                        label: 'Likes',
                        data: [28, 48, 40, 19],
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderRadius: 6
                    },
                    {
                        label: 'Comments',
                        data: [12, 19, 13, 15],
                        backgroundColor: 'rgba(245, 158, 11, 0.8)',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: true, color: '#F3F4F6' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    },
    
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    },
    
    async viewVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        this.currentVideoId = videoId;
        
        const modalBody = document.getElementById('viewVideoBody');
        const supplier = video.supplier || {};
        const product = video.product || {};
        
        modalBody.innerHTML = `
            <div class="video-preview-container">
                <video controls autoplay loop>
                    <source src="${video.video_url}" type="video/mp4">
                </video>
            </div>
            
            <div class="video-detail-stats">
                <div class="detail-stat">
                    <div class="value">${video.views || 0}</div>
                    <div class="label">Views</div>
                </div>
                <div class="detail-stat">
                    <div class="value">${video.likes || 0}</div>
                    <div class="label">Likes</div>
                </div>
                <div class="detail-stat">
                    <div class="value">${video.comments || 0}</div>
                    <div class="label">Comments</div>
                </div>
                <div class="detail-stat">
                    <div class="value">${this.formatDuration(video.duration || 0)}</div>
                    <div class="label">Duration</div>
                </div>
            </div>
            
            <div class="video-detail-info">
                <div class="info-row">
                    <span class="info-label">Supplier:</span>
                    <span class="info-value">${this.escapeHtml(supplier.business_name || 'Unknown')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Product:</span>
                    <span class="info-value">${this.escapeHtml(product.title || 'Unknown')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Caption:</span>
                    <span class="info-value">${this.escapeHtml(video.caption || 'No caption')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Uploaded:</span>
                    <span class="info-value">${new Date(video.created_at).toLocaleString()}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status:</span>
                    <span class="info-value">
                        <span class="status-badge ${video.is_active ? 'active' : 'inactive'}">
                            ${video.is_active ? 'Active' : 'Inactive'}
                        </span>
                        ${video.featured ? '<span class="status-badge featured" style="margin-left: 4px;">Featured</span>' : ''}
                    </span>
                </div>
            </div>
        `;
        
        document.getElementById('viewVideoModal').classList.add('show');
    },
    
    openEditModal(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        this.currentVideoId = videoId;
        
        document.getElementById('editVideoId').value = video.id;
        document.getElementById('editVideoStatus').value = video.is_active ? 'true' : 'false';
        document.getElementById('editVideoFeatured').value = video.featured ? 'true' : 'false';
        document.getElementById('editVideoCategory').value = video.category || '';
        document.getElementById('editAdminNotes').value = video.admin_notes || '';
        
        document.getElementById('editVideoModal').classList.add('show');
    },
    
    async saveVideoChanges() {
        const videoId = document.getElementById('editVideoId').value;
        const status = document.getElementById('editVideoStatus').value === 'true';
        const featured = document.getElementById('editVideoFeatured').value === 'true';
        const category = document.getElementById('editVideoCategory').value;
        const adminNotes = document.getElementById('editAdminNotes').value;
        
        try {
            const { error } = await sb
                .from('product_videos')
                .update({
                    is_active: status,
                    featured: featured,
                    category: category,
                    admin_notes: adminNotes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', videoId);
            
            if (error) throw error;
            
            // Update local data
            const video = this.videos.find(v => v.id == videoId);
            if (video) {
                video.is_active = status;
                video.featured = featured;
                video.category = category;
                video.admin_notes = adminNotes;
            }
            
            this.closeEditModal();
            this.renderTable();
            this.showToast('Video updated successfully', 'success');
            
        } catch (error) {
            console.error('Error updating video:', error);
            this.showToast('Error updating video', 'error');
        }
    },
    
    openWarnModal(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        this.currentVideoId = videoId;
        
        const supplierName = video.supplier?.business_name || 'this supplier';
        document.getElementById('warnSupplierName').textContent = supplierName;
        
        document.getElementById('warnModal').classList.add('show');
    },
    
    async sendWarning() {
        const videoId = this.currentVideoId;
        const video = this.videos.find(v => v.id === videoId);
        
        const reason = document.getElementById('warnReason').value;
        const notes = document.getElementById('warnNotes').value;
        const autoDeactivate = document.getElementById('autoDeactivate').checked;
        
        try {
            // Create notification for supplier
            const { error: notifError } = await sb
                .from('notifications')
                .insert({
                    user_id: video.supplier?.profile?.id,
                    type: 'admin_alert',
                    title: 'Warning: Video Content',
                    message: `Your video has been reported: ${reason}. ${notes}`,
                    link: `/supplier-videos.html`,
                    created_at: new Date().toISOString()
                });
            
            if (notifError) throw notifError;
            
            // Auto-deactivate if checked
            if (autoDeactivate) {
                const { error: updateError } = await sb
                    .from('product_videos')
                    .update({ is_active: false })
                    .eq('id', videoId);
                
                if (updateError) throw updateError;
                
                video.is_active = false;
            }
            
            // Log admin action
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: this.currentUser.id,
                    action_type: 'user_warned',
                    target_user_id: video.supplier?.profile?.id,
                    target_ad_id: videoId,
                    details: { reason, notes, autoDeactivate },
                    performed_at: new Date().toISOString()
                });
            
            this.closeWarnModal();
            this.renderTable();
            this.showToast('Warning sent to supplier', 'success');
            
        } catch (error) {
            console.error('Error sending warning:', error);
            this.showToast('Error sending warning', 'error');
        }
    },
    
    openDeleteModal(videoId) {
        this.currentVideoId = videoId;
        document.getElementById('deleteModal').classList.add('show');
    },
    
    async deleteVideo(videoId = null) {
        const id = videoId || this.currentVideoId;
        const video = this.videos.find(v => v.id === id);
        if (!video) return;
        
        const banSupplier = document.getElementById('banSupplier')?.checked || false;
        
        try {
            // Delete video from database
            const { error } = await sb
                .from('product_videos')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            // Delete from storage
            try {
                const videoPath = video.video_url.split('/').pop();
                const thumbnailPath = video.thumbnail_url?.split('/').pop();
                const supplierId = video.supplier_id;
                
                if (videoPath) {
                    await sb.storage
                        .from('product-videos')
                        .remove([`${supplierId}/videos/${videoPath}`]);
                }
                
                if (thumbnailPath) {
                    await sb.storage
                        .from('product-videos')
                        .remove([`${supplierId}/thumbnails/${thumbnailPath}`]);
                }
            } catch (storageError) {
                console.warn('Could not delete from storage:', storageError);
            }
            
            // Ban supplier if requested
            if (banSupplier) {
                await sb
                    .from('profiles')
                    .update({ is_banned: true })
                    .eq('id', video.supplier?.profile?.id);
            }
            
            // Log admin action
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: this.currentUser.id,
                    action_type: 'ad_deleted',
                    target_ad_id: id,
                    target_user_id: video.supplier?.profile?.id,
                    details: { ban_supplier: banSupplier },
                    performed_at: new Date().toISOString()
                });
            
            // Remove from local array
            this.videos = this.videos.filter(v => v.id !== id);
            this.filteredVideos = this.filteredVideos.filter(v => v.id !== id);
            this.selectedVideos.delete(id);
            
            this.closeDeleteModal();
            this.renderTable();
            this.updateStats();
            this.showToast('Video deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting video:', error);
            this.showToast('Error deleting video', 'error');
        }
    },
    
    toggleSelect(videoId) {
        if (this.selectedVideos.has(videoId)) {
            this.selectedVideos.delete(videoId);
        } else {
            this.selectedVideos.add(videoId);
        }
        
        this.updateBulkActionsBar();
        this.renderTable();
    },
    
    toggleSelectAll() {
        const selectAll = document.getElementById('selectAll');
        
        if (selectAll.checked) {
            this.videos.forEach(v => this.selectedVideos.add(v.id));
        } else {
            this.selectedVideos.clear();
        }
        
        this.updateBulkActionsBar();
        this.renderTable();
    },
    
    clearSelection() {
        this.selectedVideos.clear();
        this.updateBulkActionsBar();
        this.renderTable();
    },
    
    updateBulkActionsBar() {
        const bar = document.getElementById('bulkActionsBar');
        const countEl = document.getElementById('selectedCount');
        
        if (this.selectedVideos.size > 0) {
            bar.style.display = 'flex';
            countEl.textContent = this.selectedVideos.size;
        } else {
            bar.style.display = 'none';
        }
    },
    
    async bulkActivate() {
        if (this.selectedVideos.size === 0) return;
        
        const count = this.selectedVideos.size;
        document.getElementById('bulkMessage').innerHTML = `Are you sure you want to activate <span id="bulkCount">${count}</span> videos?`;
        document.getElementById('bulkModal').classList.add('show');
        
        document.getElementById('confirmBulkBtn').onclick = async () => {
            try {
                const { error } = await sb
                    .from('product_videos')
                    .update({ is_active: true })
                    .in('id', Array.from(this.selectedVideos));
                
                if (error) throw error;
                
                // Update local data
                this.videos.forEach(v => {
                    if (this.selectedVideos.has(v.id)) {
                        v.is_active = true;
                    }
                });
                
                this.closeBulkModal();
                this.clearSelection();
                this.renderTable();
                this.showToast(`${count} videos activated`, 'success');
                
            } catch (error) {
                console.error('Error bulk activating:', error);
                this.showToast('Error activating videos', 'error');
            }
        };
    },
    
    async bulkDeactivate() {
        if (this.selectedVideos.size === 0) return;
        
        const count = this.selectedVideos.size;
        document.getElementById('bulkMessage').innerHTML = `Are you sure you want to deactivate <span id="bulkCount">${count}</span> videos?`;
        document.getElementById('bulkModal').classList.add('show');
        
        document.getElementById('confirmBulkBtn').onclick = async () => {
            try {
                const { error } = await sb
                    .from('product_videos')
                    .update({ is_active: false })
                    .in('id', Array.from(this.selectedVideos));
                
                if (error) throw error;
                
                // Update local data
                this.videos.forEach(v => {
                    if (this.selectedVideos.has(v.id)) {
                        v.is_active = false;
                    }
                });
                
                this.closeBulkModal();
                this.clearSelection();
                this.renderTable();
                this.showToast(`${count} videos deactivated`, 'success');
                
            } catch (error) {
                console.error('Error bulk deactivating:', error);
                this.showToast('Error deactivating videos', 'error');
            }
        };
    },
    
    async bulkDelete() {
        if (this.selectedVideos.size === 0) return;
        
        const count = this.selectedVideos.size;
        document.getElementById('bulkMessage').innerHTML = `Are you sure you want to delete <span id="bulkCount">${count}</span> videos? This action cannot be undone.`;
        document.getElementById('bulkModal').classList.add('show');
        
        document.getElementById('confirmBulkBtn').onclick = async () => {
            try {
                // Delete from database
                const { error } = await sb
                    .from('product_videos')
                    .delete()
                    .in('id', Array.from(this.selectedVideos));
                
                if (error) throw error;
                
                // Remove from local array
                this.videos = this.videos.filter(v => !this.selectedVideos.has(v.id));
                this.filteredVideos = this.filteredVideos.filter(v => !this.selectedVideos.has(v.id));
                
                this.closeBulkModal();
                this.clearSelection();
                this.renderTable();
                this.updateStats();
                this.showToast(`${count} videos deleted`, 'success');
                
            } catch (error) {
                console.error('Error bulk deleting:', error);
                this.showToast('Error deleting videos', 'error');
            }
        };
    },
    
    applyFilters() {
        this.filters.search = document.getElementById('searchInput')?.value || '';
        this.filters.supplier = document.getElementById('supplierFilter')?.value || 'all';
        this.filters.status = document.getElementById('statusFilter')?.value || 'all';
        this.filters.date = document.getElementById('dateFilter')?.value || 'all';
        this.filters.sort = document.getElementById('sortFilter')?.value || 'latest';
        
        this.currentPage = 1;
        this.loadVideos(true);
    },
    
    resetFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('supplierFilter').value = 'all';
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('dateFilter').value = 'all';
        document.getElementById('sortFilter').value = 'latest';
        
        this.filters = {
            search: '',
            supplier: 'all',
            status: 'all',
            date: 'all',
            sort: 'latest'
        };
        
        this.currentPage = 1;
        this.loadVideos(true);
    },
    
    goToPage(page) {
        if (page === 'prev') {
            if (this.currentPage > 1) this.currentPage--;
        } else if (page === 'next') {
            if (this.currentPage < this.totalPages) this.currentPage++;
        } else if (page === 'first') {
            this.currentPage = 1;
        } else if (page === 'last') {
            this.currentPage = this.totalPages;
        } else if (typeof page === 'number') {
            this.currentPage = page;
        }
        
        this.loadVideos(true);
    },
    
    updatePagination() {
        const pageNumbers = document.getElementById('pageNumbers');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const firstBtn = document.getElementById('firstPage');
        const lastBtn = document.getElementById('lastPage');
        
        if (!pageNumbers) return;
        
        // Generate page numbers
        let pages = [];
        const maxVisible = 5;
        const halfVisible = Math.floor(maxVisible / 2);
        
        let start = Math.max(1, this.currentPage - halfVisible);
        let end = Math.min(this.totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        
        pageNumbers.innerHTML = pages.map(p => `
            <span class="page-number ${p === this.currentPage ? 'active' : ''}" onclick="AdminVideos.goToPage(${p})">${p}</span>
        `).join('');
        
        // Update button states
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === this.totalPages;
        if (firstBtn) firstBtn.disabled = this.currentPage === 1;
        if (lastBtn) lastBtn.disabled = this.currentPage === this.totalPages;
    },
    
    exportData() {
        const data = this.videos.map(v => ({
            id: v.id,
            supplier: v.supplier?.business_name,
            product: v.product?.title,
            caption: v.caption,
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            status: v.is_active ? 'active' : 'inactive',
            featured: v.featured,
            created_at: v.created_at
        }));
        
        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `videos_export_${new Date().toISOString().split('T')[0]}.csv`);
        this.showToast('Data exported successfully', 'success');
    },
    
    convertToCSV(data) {
        if (data.length === 0) return '';
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(obj => Object.values(obj).map(v => `"${v}"`).join(','));
        return [headers, ...rows].join('\n');
    },
    
    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    refreshData() {
        this.loadVideos(true);
        this.updateCharts();
        this.showToast('Data refreshed', 'success');
    },
    
    updateCharts() {
        // Update with real data
        if (this.charts.uploads) {
            // Update uploads chart data
            this.charts.uploads.data.datasets[0].data = this.generateUploadData();
            this.charts.uploads.update();
        }
        
        if (this.charts.performance) {
            // Update performance chart based on selected metric
            const period = document.getElementById('performanceChartPeriod')?.value || 'views';
            this.updatePerformanceChart(period);
        }
    },
    
    generateUploadData() {
        // Generate mock data - replace with real data from database
        return Array(30).fill(0).map(() => Math.floor(Math.random() * 15) + 1);
    },
    
    updatePerformanceChart(metric) {
        if (!this.charts.performance) return;
        
        // Update based on selected metric
        if (metric === 'views') {
            this.charts.performance.data.datasets = [
                {
                    label: 'Views',
                    data: [65, 59, 80, 81],
                    backgroundColor: 'rgba(11, 79, 108, 0.8)',
                    borderRadius: 6
                }
            ];
        } else if (metric === 'likes') {
            this.charts.performance.data.datasets = [
                {
                    label: 'Likes',
                    data: [28, 48, 40, 19],
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 6
                }
            ];
        } else if (metric === 'comments') {
            this.charts.performance.data.datasets = [
                {
                    label: 'Comments',
                    data: [12, 19, 13, 15],
                    backgroundColor: 'rgba(245, 158, 11, 0.8)',
                    borderRadius: 6
                }
            ];
        }
        
        this.charts.performance.update();
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
    
    closeViewModal() {
        document.getElementById('viewVideoModal')?.classList.remove('show');
        const video = document.querySelector('#viewVideoModal video');
        if (video) video.pause();
    },
    
    closeEditModal() {
        document.getElementById('editVideoModal')?.classList.remove('show');
    },
    
    closeWarnModal() {
        document.getElementById('warnModal')?.classList.remove('show');
        document.getElementById('warnReason').value = 'inappropriate';
        document.getElementById('warnNotes').value = '';
        document.getElementById('autoDeactivate').checked = false;
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal')?.classList.remove('show');
        document.getElementById('banSupplier').checked = false;
    },
    
    closeBulkModal() {
        document.getElementById('bulkModal')?.classList.remove('show');
    },
    
    closeSuccessModal() {
        document.getElementById('successModal')?.classList.remove('show');
    },
    
    setupEventListeners() {
        // Menu toggle for mobile
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('open');
            });
        }
        
        // Search with debounce
        let searchTimeout;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.applyFilters(), 500);
            });
        }
        
        // Filter changes
        document.getElementById('supplierFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('statusFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('dateFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('sortFilter')?.addEventListener('change', () => this.applyFilters());
        
        // Chart period changes
        document.getElementById('uploadChartPeriod')?.addEventListener('change', (e) => {
            // Update uploads chart period
            if (this.charts.uploads) {
                // Update with new data based on period
                this.charts.uploads.update();
            }
        });
        
        document.getElementById('performanceChartPeriod')?.addEventListener('change', (e) => {
            this.updatePerformanceChart(e.target.value);
        });
        
        // Date range picker
        const dateRange = document.getElementById('dateRange');
        if (dateRange) {
            dateRange.addEventListener('click', () => {
                // Open date range picker
                console.log('Open date range picker');
            });
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeViewModal();
                    this.closeEditModal();
                    this.closeWarnModal();
                    this.closeDeleteModal();
                    this.closeBulkModal();
                    this.closeSuccessModal();
                }
            });
        });
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeViewModal();
                this.closeEditModal();
                this.closeWarnModal();
                this.closeDeleteModal();
                this.closeBulkModal();
                this.closeSuccessModal();
            }
        });
    }
};

// Global functions
window.AdminVideos = AdminVideos;
window.toggleSelect = (id) => AdminVideos.toggleSelect(id);
window.toggleSelectAll = () => AdminVideos.toggleSelectAll();
window.viewVideo = (id) => AdminVideos.viewVideo(id);
window.openEditModal = (id) => AdminVideos.openEditModal(id);
window.openWarnModal = (id) => AdminVideos.openWarnModal(id);
window.openDeleteModal = (id) => AdminVideos.openDeleteModal(id);
window.deleteVideo = (id) => AdminVideos.deleteVideo(id);
window.applyFilters = () => AdminVideos.applyFilters();
window.resetFilters = () => AdminVideos.resetFilters();
window.goToPage = (page) => AdminVideos.goToPage(page);
window.exportData = () => AdminVideos.exportData();
window.refreshData = () => AdminVideos.refreshData();
window.closeViewModal = () => AdminVideos.closeViewModal();
window.closeEditModal = () => AdminVideos.closeEditModal();
window.closeWarnModal = () => AdminVideos.closeWarnModal();
window.closeDeleteModal = () => AdminVideos.closeDeleteModal();
window.closeBulkModal = () => AdminVideos.closeBulkModal();
window.closeSuccessModal = () => AdminVideos.closeSuccessModal();
window.saveVideoChanges = () => AdminVideos.saveVideoChanges();
window.sendWarning = () => AdminVideos.sendWarning();
window.clearSelection = () => AdminVideos.clearSelection();
window.bulkActivate = () => AdminVideos.bulkActivate();
window.bulkDeactivate = () => AdminVideos.bulkDeactivate();
window.bulkDelete = () => AdminVideos.bulkDelete();

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminVideos.init());
} else {
    AdminVideos.init();
}