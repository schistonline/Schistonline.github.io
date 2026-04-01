// ============================================
// NOTIFICATIONS MANAGEMENT
// Based on database schema with notifications table
// ============================================

console.log('🔔 Notifications loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const NotificationsManager = {
    currentUser: null,
    notifications: [],
    filteredNotifications: [],
    currentPage: 1,
    itemsPerPage: 20,
    hasMore: true,
    isLoading: false,
    currentTab: 'all',
    filters: {
        types: ['order', 'inquiry', 'quote', 'message', 'system', 'promotion'],
        status: 'all',
        dateRange: 'all'
    },
    selectedNotifications: new Set(),
    selectMode: false,
    unreadCount: 0,
    totalCount: 0,
    realtimeSubscription: null,
    quietHours: {
        enabled: false,
        start: 22, // 10 PM
        end: 6     // 6 AM
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Notifications initializing...');
        
        try {
            await this.checkAuth();
            await this.loadNotifications();
            this.setupEventListeners();
            this.setupRealtimeSubscription();
            this.loadSettings();
            this.updateUnreadCount();
            
            console.log('✅ Notifications initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading notifications', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=notifications.html';
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
    // LOAD NOTIFICATIONS
    // ============================================
    async loadNotifications(reset = true) {
        if (!this.currentUser || this.isLoading) return;
        
        this.isLoading = true;
        
        // Get DOM elements safely
        const loadingEl = document.getElementById('loadingState');
        const notificationsList = document.getElementById('notificationsList');
        const emptyEl = document.getElementById('emptyState');
        const loadMoreEl = document.getElementById('loadMore');
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            
            if (loadingEl) loadingEl.style.display = 'block';
            if (notificationsList) notificationsList.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'none';
            if (loadMoreEl) loadMoreEl.style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('notifications')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });
            
            // Apply type filter
            if (this.filters.types && this.filters.types.length > 0) {
                query = query.in('type', this.filters.types);
            }
            
            // Apply status filter
            if (this.filters.status === 'unread') {
                query = query.eq('is_read', false);
            } else if (this.filters.status === 'read') {
                query = query.eq('is_read', true);
            }
            
            // Apply date range filter
            if (this.filters.dateRange !== 'all') {
                const now = new Date();
                let startDate = new Date();
                
                if (this.filters.dateRange === 'today') {
                    startDate.setHours(0, 0, 0, 0);
                } else if (this.filters.dateRange === 'week') {
                    startDate.setDate(now.getDate() - 7);
                } else if (this.filters.dateRange === 'month') {
                    startDate.setMonth(now.getMonth() - 1);
                }
                
                query = query.gte('created_at', startDate.toISOString());
            }
            
            // Apply tab filter
            if (this.currentTab === 'unread') {
                query = query.eq('is_read', false);
            }
            
            const { data, error, count } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.notifications = data || [];
            } else {
                this.notifications = [...this.notifications, ...(data || [])];
            }
            
            this.filteredNotifications = this.notifications;
            this.hasMore = (data || []).length === this.itemsPerPage;
            this.totalCount = count || this.notifications.length;
            this.updateUnreadCount();
            this.renderNotifications();
            
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (emptyEl) {
                emptyEl.style.display = this.filteredNotifications.length === 0 ? 'block' : 'none';
            }
            
            if (loadMoreEl) {
                loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showToast('Error loading notifications', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    // ============================================
    // RENDER NOTIFICATIONS
    // ============================================
    renderNotifications() {
        const container = document.getElementById('notificationsList');
        if (!container) return;
        
        if (this.filteredNotifications.length === 0) return;
        
        container.innerHTML = this.filteredNotifications.map(notification => 
            this.renderNotificationItem(notification)
        ).join('');
    },
    
    renderNotificationItem(notification) {
        const timeAgo = this.getTimeAgo(new Date(notification.created_at));
        const isUnread = !notification.is_read;
        const type = notification.type || 'system';
        const iconClass = this.getIconClass(type);
        
        const selectedClass = this.selectedNotifications.has(notification.id) ? 'selected' : '';
        
        return `
            <div class="notification-item ${isUnread ? 'unread' : ''} ${this.selectMode ? 'select-mode' : ''} ${selectedClass}" 
                 data-id="${notification.id}" 
                 onclick="NotificationsManager.openNotification(${notification.id})">
                ${this.selectMode ? `
                    <input type="checkbox" class="selection-checkbox" 
                           ${this.selectedNotifications.has(notification.id) ? 'checked' : ''}
                           onclick="event.stopPropagation(); NotificationsManager.toggleSelection(${notification.id})">
                ` : ''}
                <div class="notification-icon ${type}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-header">
                        <h4 class="notification-title">${this.escapeHtml(notification.title)}</h4>
                        <span class="notification-time">${timeAgo}</span>
                    </div>
                    <p class="notification-message">${this.escapeHtml(notification.message)}</p>
                    <div class="notification-meta">
                        <span class="notification-badge ${type}">${type}</span>
                        ${notification.ad_id ? `<span><i class="far fa-eye"></i> View product</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },
    
    getIconClass(type) {
        const icons = {
            'order': 'fas fa-shopping-bag',
            'inquiry': 'fas fa-question-circle',
            'quote': 'fas fa-file-invoice',
            'message': 'fas fa-envelope',
            'system': 'fas fa-cog',
            'promotion': 'fas fa-gift'
        };
        return icons[type] || 'fas fa-bell';
    },
    
    // ============================================
    // UPDATE UNREAD COUNT
    // ============================================
    updateUnreadCount() {
        this.unreadCount = this.notifications.filter(n => !n.is_read).length;
        
        const unreadEl = document.getElementById('unreadCount');
        const totalEl = document.getElementById('totalCount');
        
        if (unreadEl) unreadEl.textContent = this.unreadCount;
        if (totalEl) totalEl.textContent = this.notifications.length;
        
        // Update document title
        if (this.unreadCount > 0) {
            document.title = `(${this.unreadCount}) Notifications - iBlue B2B`;
        } else {
            document.title = 'Notifications - iBlue B2B';
        }
    },
    
    // ============================================
    // NOTIFICATION ACTIONS
    // ============================================
    async markAsRead(notificationId) {
        try {
            const { error } = await sb
                .from('notifications')
                .update({ 
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('id', notificationId);
            
            if (error) throw error;
            
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification) {
                notification.is_read = true;
            }
            
            this.updateUnreadCount();
            this.renderNotifications();
            
        } catch (error) {
            console.error('Error marking as read:', error);
            this.showToast('Error updating notification', 'error');
        }
    },
    
    async markAllAsRead() {
        if (this.unreadCount === 0) {
            this.showToast('No unread notifications', 'info');
            return;
        }
        
        try {
            const { error } = await sb
                .from('notifications')
                .update({ 
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('user_id', this.currentUser.id)
                .eq('is_read', false);
            
            if (error) throw error;
            
            this.notifications.forEach(n => n.is_read = true);
            this.updateUnreadCount();
            this.renderNotifications();
            this.showToast('All notifications marked as read', 'success');
            
        } catch (error) {
            console.error('Error marking all as read:', error);
            this.showToast('Error updating notifications', 'error');
        }
    },
    
    async openNotification(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (!notification) return;
        
        if (this.selectMode) {
            this.toggleSelection(notificationId);
            return;
        }
        
        // Mark as read if unread
        if (!notification.is_read) {
            await this.markAsRead(notificationId);
        }
        
        // Show detail modal
        this.showNotificationDetail(notification);
    },
    
    showNotificationDetail(notification) {
        const modalBody = document.getElementById('notificationModalBody');
        const modalTitle = document.getElementById('modalTitle');
        const actionBtn = document.getElementById('modalActionBtn');
        
        const time = new Date(notification.created_at).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const type = notification.type || 'system';
        const iconClass = this.getIconClass(type);
        
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="notification-detail">
                    <div class="notification-detail-icon ${type}">
                        <i class="${iconClass}"></i>
                    </div>
                    <h2>${this.escapeHtml(notification.title)}</h2>
                    <div class="notification-detail-time">${time}</div>
                    <div class="notification-detail-message">
                        ${this.escapeHtml(notification.message)}
                    </div>
                    <div class="notification-detail-meta">
                        <div class="meta-row">
                            <span class="meta-label">Type</span>
                            <span class="meta-value">${type}</span>
                        </div>
                        <div class="meta-row">
                            <span class="meta-label">Status</span>
                            <span class="meta-value">${notification.is_read ? 'Read' : 'Unread'}</span>
                        </div>
                        ${notification.ad_id ? `
                            <div class="meta-row">
                                <span class="meta-label">Product ID</span>
                                <span class="meta-value">#${notification.ad_id}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        if (modalTitle) modalTitle.textContent = 'Notification Details';
        
        // Set action button
        if (actionBtn) {
            if (notification.link) {
                actionBtn.style.display = 'block';
                actionBtn.onclick = () => {
                    window.location.href = notification.link;
                };
            } else if (notification.ad_id) {
                actionBtn.style.display = 'block';
                actionBtn.onclick = () => {
                    window.location.href = `product-detail.html?id=${notification.ad_id}`;
                };
            } else {
                actionBtn.style.display = 'none';
            }
        }
        
        document.getElementById('notificationModal').classList.add('show');
    },
    
    // ============================================
    // SELECTION MODE
    // ============================================
    toggleSelectMode() {
        this.selectMode = !this.selectMode;
        this.selectedNotifications.clear();
        
        if (this.selectMode) {
            this.showBulkActionsBar();
        } else {
            this.hideBulkActionsBar();
        }
        
        this.renderNotifications();
    },
    
    toggleSelection(notificationId) {
        if (this.selectedNotifications.has(notificationId)) {
            this.selectedNotifications.delete(notificationId);
        } else {
            this.selectedNotifications.add(notificationId);
        }
        
        this.updateBulkActionsBar();
        this.renderNotifications();
    },
    
    selectAll() {
        this.filteredNotifications.forEach(n => {
            this.selectedNotifications.add(n.id);
        });
        this.updateBulkActionsBar();
        this.renderNotifications();
    },
    
    clearSelection() {
        this.selectedNotifications.clear();
        this.updateBulkActionsBar();
        this.renderNotifications();
    },
    
    showBulkActionsBar() {
        let bar = document.getElementById('bulkActionsBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'bulkActionsBar';
            bar.className = 'bulk-actions-bar';
            bar.innerHTML = `
                <div class="bulk-actions-info">
                    <span id="selectedCount">0</span> selected
                </div>
                <div class="bulk-actions-buttons">
                    <button class="bulk-action-icon" onclick="NotificationsManager.selectAll()" title="Select All">
                        <i class="fas fa-check-double"></i>
                    </button>
                    <button class="bulk-action-icon" onclick="NotificationsManager.clearSelection()" title="Clear">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="bulk-action-icon" onclick="NotificationsManager.bulkMarkRead()" title="Mark as Read">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="bulk-action-icon" onclick="NotificationsManager.bulkArchive()" title="Archive">
                        <i class="fas fa-archive"></i>
                    </button>
                    <button class="bulk-action-icon danger" onclick="NotificationsManager.bulkDelete()" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            document.body.appendChild(bar);
        }
        bar.style.display = 'flex';
        this.updateBulkActionsBar();
    },
    
    hideBulkActionsBar() {
        const bar = document.getElementById('bulkActionsBar');
        if (bar) {
            bar.style.display = 'none';
        }
    },
    
    updateBulkActionsBar() {
        const countEl = document.getElementById('selectedCount');
        if (countEl) {
            countEl.textContent = this.selectedNotifications.size;
        }
    },
    
    async bulkMarkRead() {
        if (this.selectedNotifications.size === 0) {
            this.showToast('No notifications selected', 'error');
            return;
        }
        
        try {
            const { error } = await sb
                .from('notifications')
                .update({ 
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .in('id', Array.from(this.selectedNotifications));
            
            if (error) throw error;
            
            this.notifications.forEach(n => {
                if (this.selectedNotifications.has(n.id)) {
                    n.is_read = true;
                }
            });
            
            this.selectedNotifications.clear();
            this.updateUnreadCount();
            this.renderNotifications();
            this.updateBulkActionsBar();
            this.showToast('Notifications marked as read', 'success');
            
        } catch (error) {
            console.error('Error bulk marking as read:', error);
            this.showToast('Error updating notifications', 'error');
        }
    },
    
    async bulkArchive() {
        if (this.selectedNotifications.size === 0) {
            this.showToast('No notifications selected', 'error');
            return;
        }
        
        if (!confirm(`Archive ${this.selectedNotifications.size} notification(s)?`)) return;
        
        try {
            // In a real implementation, you might have an 'archived' status
            // For now, we'll just delete them
            const { error } = await sb
                .from('notifications')
                .delete()
                .in('id', Array.from(this.selectedNotifications));
            
            if (error) throw error;
            
            this.notifications = this.notifications.filter(n => !this.selectedNotifications.has(n.id));
            this.filteredNotifications = this.filteredNotifications.filter(n => !this.selectedNotifications.has(n.id));
            
            this.selectedNotifications.clear();
            this.updateUnreadCount();
            this.renderNotifications();
            this.updateBulkActionsBar();
            this.showToast('Notifications archived', 'success');
            
        } catch (error) {
            console.error('Error archiving notifications:', error);
            this.showToast('Error archiving notifications', 'error');
        }
    },
    
    async bulkDelete() {
        if (this.selectedNotifications.size === 0) {
            this.showToast('No notifications selected', 'error');
            return;
        }
        
        if (!confirm(`Delete ${this.selectedNotifications.size} notification(s)? This action cannot be undone.`)) return;
        
        try {
            const { error } = await sb
                .from('notifications')
                .delete()
                .in('id', Array.from(this.selectedNotifications));
            
            if (error) throw error;
            
            this.notifications = this.notifications.filter(n => !this.selectedNotifications.has(n.id));
            this.filteredNotifications = this.filteredNotifications.filter(n => !this.selectedNotifications.has(n.id));
            
            this.selectedNotifications.clear();
            this.updateUnreadCount();
            this.renderNotifications();
            this.hideBulkActionsBar();
            this.showToast('Notifications deleted', 'success');
            
        } catch (error) {
            console.error('Error deleting notifications:', error);
            this.showToast('Error deleting notifications', 'error');
        }
    },
    
    // ============================================
    // REAL-TIME UPDATES
    // ============================================
    setupRealtimeSubscription() {
        if (!this.currentUser) return;
        
        this.realtimeSubscription = sb
            .channel('notifications-channel')
            .on('postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'notifications',
                    filter: `user_id=eq.${this.currentUser.id}`
                }, 
                payload => {
                    this.handleNewNotification(payload.new);
                }
            )
            .subscribe();
    },
    
    handleNewNotification(notification) {
        // Check quiet hours
        if (this.quietHours.enabled && this.isQuietHours()) {
            console.log('Quiet hours - suppressing notification sound');
            return;
        }
        
        // Add to list
        this.notifications.unshift(notification);
        this.filteredNotifications = this.notifications;
        this.updateUnreadCount();
        this.renderNotifications();
        
        // Play sound
        this.playNotificationSound();
        
        // Show toast
        this.showToast(`New: ${notification.title}`, 'info');
        
        // Update page title
        document.title = `(${this.unreadCount}) Notifications - iBlue B2B`;
    },
    
    isQuietHours() {
        const now = new Date();
        const hour = now.getHours();
        
        if (this.quietHours.start < this.quietHours.end) {
            return hour >= this.quietHours.start && hour < this.quietHours.end;
        } else {
            return hour >= this.quietHours.start || hour < this.quietHours.end;
        }
    },
    
    playNotificationSound() {
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            console.log('Audio not supported');
        }
    },
    
    // ============================================
    // FILTERS
    // ============================================
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    },
    
    applyFilters() {
        // Get selected types
        const selectedTypes = [];
        document.querySelectorAll('.type-filter:checked').forEach(cb => {
            selectedTypes.push(cb.value);
        });
        
        this.filters = {
            types: selectedTypes,
            status: document.getElementById('statusFilter')?.value || 'all',
            dateRange: document.getElementById('dateRange')?.value || 'all'
        };
        
        this.closeFilterPanel();
        this.loadNotifications(true);
    },
    
    resetFilters() {
        // Check all type checkboxes
        document.querySelectorAll('.type-filter').forEach(cb => cb.checked = true);
        
        const statusFilter = document.getElementById('statusFilter');
        const dateRange = document.getElementById('dateRange');
        
        if (statusFilter) statusFilter.value = 'all';
        if (dateRange) dateRange.value = 'all';
        
        this.filters = {
            types: ['order', 'inquiry', 'quote', 'message', 'system', 'promotion'],
            status: 'all',
            dateRange: 'all'
        };
        
        this.closeFilterPanel();
        this.loadNotifications(true);
    },
    
    closeFilterPanel() {
        const panel = document.getElementById('filterPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    },
    
    // ============================================
    // TABS
    // ============================================
    switchTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        this.loadNotifications(true);
    },
    
    // ============================================
    // SETTINGS
    // ============================================
    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('notificationSettings')) || {};
            
            this.quietHours.enabled = settings.quietHours?.enabled || false;
            this.quietHours.start = settings.quietHours?.start || 22;
            this.quietHours.end = settings.quietHours?.end || 6;
            
            // Update UI if settings modal is open
            const quietHoursCheck = document.getElementById('quietHours');
            if (quietHoursCheck) {
                quietHoursCheck.checked = this.quietHours.enabled;
            }
            
            const quietStart = document.getElementById('quietStart');
            const quietEnd = document.getElementById('quietEnd');
            
            if (quietStart) quietStart.value = this.quietHours.start;
            if (quietEnd) quietEnd.value = this.quietHours.end;
            
            const quietRange = document.getElementById('quietHoursRange');
            if (quietRange) {
                quietRange.style.display = this.quietHours.enabled ? 'flex' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    },
    
    openSettingsModal() {
        this.loadSettings();
        document.getElementById('settingsModal').classList.add('show');
        
        // Toggle quiet hours range
        const quietHoursCheck = document.getElementById('quietHours');
        const quietRange = document.getElementById('quietHoursRange');
        
        if (quietHoursCheck && quietRange) {
            quietHoursCheck.addEventListener('change', (e) => {
                quietRange.style.display = e.target.checked ? 'flex' : 'none';
            });
        }
    },
    
    saveSettings() {
        const settings = {
            quietHours: {
                enabled: document.getElementById('quietHours')?.checked || false,
                start: parseInt(document.getElementById('quietStart')?.value) || 22,
                end: parseInt(document.getElementById('quietEnd')?.value) || 6
            },
            email: {
                orders: document.getElementById('emailOrders')?.checked || true,
                inquiries: document.getElementById('emailInquiries')?.checked || true,
                quotes: document.getElementById('emailQuotes')?.checked || true,
                messages: document.getElementById('emailMessages')?.checked || true
            },
            push: {
                sound: document.getElementById('pushSound')?.checked || true,
                vibrate: document.getElementById('pushVibrate')?.checked || true,
                preview: document.getElementById('pushPreview')?.checked || true
            }
        };
        
        localStorage.setItem('notificationSettings', JSON.stringify(settings));
        
        this.quietHours = settings.quietHours;
        
        this.closeSettingsModal();
        this.showToast('Settings saved', 'success');
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    
    refreshNotifications() {
        this.loadNotifications(true);
    },
    
    loadMoreNotifications() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadNotifications(false);
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeNotificationModal() {
        document.getElementById('notificationModal').classList.remove('show');
    },
    
    openBulkModal() {
        document.getElementById('selectedCount').textContent = this.selectedNotifications.size;
        document.getElementById('bulkModal').classList.add('show');
    },
    
    closeBulkModal() {
        document.getElementById('bulkModal').classList.remove('show');
    },
    
    closeSettingsModal() {
        document.getElementById('settingsModal').classList.remove('show');
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Mark all as read
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                this.markAllAsRead();
            });
        }
        
        // Filter button
        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.toggleFilterPanel();
            });
        }
        
        // Apply filters
        const applyBtn = document.getElementById('applyFilters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }
        
        // Reset filters
        const resetBtn = document.getElementById('resetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetFilters();
            });
        }
        
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Long press for select mode
        let pressTimer;
        document.addEventListener('touchstart', (e) => {
            const notificationItem = e.target.closest('.notification-item');
            if (notificationItem && !this.selectMode) {
                pressTimer = setTimeout(() => {
                    this.toggleSelectMode();
                }, 500);
            }
        });
        
        document.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        
        document.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeNotificationModal();
                    this.closeBulkModal();
                    this.closeSettingsModal();
                    this.closeDeleteModal();
                }
            });
        });
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.selectMode) {
                    this.toggleSelectMode();
                }
                this.closeNotificationModal();
                this.closeBulkModal();
                this.closeSettingsModal();
                this.closeDeleteModal();
            }
        });
        
        // Quiet hours toggle
        const quietHoursCheck = document.getElementById('quietHours');
        const quietRange = document.getElementById('quietHoursRange');
        
        if (quietHoursCheck && quietRange) {
            quietHoursCheck.addEventListener('change', (e) => {
                quietRange.style.display = e.target.checked ? 'flex' : 'none';
            });
        }
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Refresh notifications when tab becomes visible
                this.loadNotifications(true);
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    NotificationsManager.init();
});

// Global functions for onclick handlers
window.NotificationsManager = NotificationsManager;
window.toggleSelectMode = () => NotificationsManager.toggleSelectMode();
window.openNotification = (id) => NotificationsManager.openNotification(id);
window.markAllAsRead = () => NotificationsManager.markAllAsRead();
window.refreshNotifications = () => NotificationsManager.refreshNotifications();
window.loadMoreNotifications = () => NotificationsManager.loadMoreNotifications();
window.closeNotificationModal = () => NotificationsManager.closeNotificationModal();
window.closeBulkModal = () => NotificationsManager.closeBulkModal();
window.closeSettingsModal = () => NotificationsManager.closeSettingsModal();
window.closeDeleteModal = () => NotificationsManager.closeDeleteModal();
window.bulkMarkRead = () => NotificationsManager.bulkMarkRead();
window.bulkArchive = () => NotificationsManager.bulkArchive();
window.bulkDelete = () => NotificationsManager.bulkDelete();
window.saveSettings = () => NotificationsManager.saveSettings();
window.openSettings = () => NotificationsManager.openSettingsModal();